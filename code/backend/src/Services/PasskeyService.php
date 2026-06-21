<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Auth\SessionManager;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\SessionRepository;
use BudgetCentre\Repositories\UserRepository;
use BudgetCentre\Repositories\WebAuthnRepository;
use BudgetCentre\Repositories\WorkspaceRepository;
use BudgetCentre\Services\BudgetPdf\BudgetPdfTheme;
use BudgetCentre\Support\Env;
use BudgetCentre\Support\Input;
use ParagonIE\ConstantTime\Base64UrlSafe;
use PDO;
use Symfony\Component\Serializer\Encoder\JsonEncoder;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAssertionResponseValidator;
use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\AuthenticatorAttestationResponseValidator;
use Webauthn\AuthenticatorSelectionCriteria;
use Webauthn\CeremonyStep\CeremonyStepManagerFactory;
use Webauthn\CredentialRecord;
use Webauthn\Denormalizer\WebauthnSerializerFactory;
use Webauthn\PublicKeyCredential;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialDescriptor;
use Webauthn\PublicKeyCredentialParameters;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialUserEntity;

final readonly class PasskeyService
{
    public function __construct(
        private PDO $pdo,
        private SessionManager $sessionManager,
        private SessionAuthenticator $authenticator,
    ) {
    }

    public function credentials(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);

        return (new WebAuthnRepository($this->pdo))->listForUser((int) $session['user_id']);
    }

    public function registrationOptions(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $this->assertPasswordAccount((int) $session['user_id']);
        $userId = (int) $session['user_id'];
        $challenge = random_bytes(32);
        $repository = new WebAuthnRepository($this->pdo);
        $repository->createChallenge(
            $userId,
            Base64UrlSafe::encodeUnpadded($challenge),
            'registration',
            gmdate('Y-m-d H:i:s', time() + 300),
        );

        return [
            'options' => $this->normalizeOptions($this->creationOptions(
                $challenge,
                [
                    'id' => $userId,
                    'email' => (string) $session['email'],
                    'display_name' => (string) $session['display_name'],
                ],
                $repository->rowsForUser($userId),
            )),
        ];
    }

    public function verifyRegistration(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $this->assertPasswordAccount((int) $session['user_id']);
        $credential = $this->credentialFromInput($input);
        if (!$credential->response instanceof AuthenticatorAttestationResponse) {
            throw new AuthException('PASSKEY_INVALID', 'Registration response is invalid.', 422);
        }

        $challenge = $credential->response->clientDataJSON->challenge;
        $repository = new WebAuthnRepository($this->pdo);
        $repository->consumeChallenge(
            Base64UrlSafe::encodeUnpadded($challenge),
            'registration',
            (int) $session['user_id'],
        ) ?? throw new AuthException('PASSKEY_CHALLENGE_INVALID', 'Passkey challenge is invalid or expired.', 419);

        $record = AuthenticatorAttestationResponseValidator::create(
            $this->ceremonyFactory()->creationCeremony(),
        )->check(
            $credential->response,
            $this->creationOptions($challenge, [
                'id' => (int) $session['user_id'],
                'email' => (string) $session['email'],
                'display_name' => (string) $session['display_name'],
            ], $repository->rowsForUser((int) $session['user_id'])),
            $this->rpId(),
        );

        if ($repository->credentialIdExists($record->publicKeyCredentialId)) {
            throw new AuthException('PASSKEY_EXISTS', 'This passkey is already registered.', 409);
        }

        $repository->createCredential(
            (int) $session['user_id'],
            $record->publicKeyCredentialId,
            $this->serializeRecord($record),
            $record->counter,
            $record->transports,
            $record->attestationType,
            $this->normalizeTrustPath($record),
            (bool) $record->backupEligible,
            (bool) $record->backupStatus,
            Input::string($input['deviceName'] ?? $input['device_name'] ?? null),
        );

        return ['credentials' => $repository->listForUser((int) $session['user_id'])];
    }

    private function assertPasswordAccount(int $userId): void
    {
        $user = (new UserRepository($this->pdo))->findWithPasswordById($userId)
            ?? throw new AuthException('USER_NOT_FOUND', 'User was not found.', 404);
        if (!is_string($user['password_hash'] ?? null)) {
            throw new AuthException(
                'SSO_ONLY_PASSWORD_DISABLED',
                'SSO-only accounts cannot add passwordless login methods. Bind an existing account to merge data.',
                409,
            );
        }
    }

    public function loginOptions(Request $request): array
    {
        $email = Input::normalizedEmail($request->query['email'] ?? null);
        $user = $email === null ? null : (new UserRepository($this->pdo))->findByEmail($email);
        $userId = $user === null ? null : (int) $user['id'];
        $challenge = random_bytes(32);

        $repository = new WebAuthnRepository($this->pdo);
        $repository->createChallenge(
            $userId,
            Base64UrlSafe::encodeUnpadded($challenge),
            'authentication',
            gmdate('Y-m-d H:i:s', time() + 300),
        );

        return [
            'options' => $this->normalizeOptions($this->requestOptions(
                $challenge,
                $userId === null ? [] : $repository->rowsForUser($userId),
            )),
        ];
    }

    public function verifyLogin(array $input, Request $request): array
    {
        $credential = $this->credentialFromInput($input);
        if (!$credential->response instanceof AuthenticatorAssertionResponse) {
            throw new AuthException('PASSKEY_INVALID', 'Authentication response is invalid.', 422);
        }

        $repository = new WebAuthnRepository($this->pdo);
        $row = $repository->findByCredentialId($credential->rawId)
            ?? throw new AuthException('PASSKEY_NOT_FOUND', 'Passkey credential was not found.', 404);
        $challengeRow = $repository->consumeChallenge(
            Base64UrlSafe::encodeUnpadded($credential->response->clientDataJSON->challenge),
            'authentication',
        ) ?? throw new AuthException('PASSKEY_CHALLENGE_INVALID', 'Passkey challenge is invalid or expired.', 419);

        if ($challengeRow['userId'] !== null && (int) $challengeRow['userId'] !== (int) $row['user_id']) {
            throw new AuthException('PASSKEY_FORBIDDEN', 'Passkey does not match this login challenge.', 403);
        }

        $record = $this->serializer()->deserialize($row['public_key'], CredentialRecord::class, JsonEncoder::FORMAT);
        $record = AuthenticatorAssertionResponseValidator::create(
            $this->ceremonyFactory()->requestCeremony(),
        )->check(
            $record,
            $credential->response,
            $this->requestOptions($credential->response->clientDataJSON->challenge, [$row]),
            $this->rpId(),
            $this->userHandle((int) $row['user_id']),
        );

        $repository->updateCredentialAfterLogin(
            (int) $row['id'],
            $this->serializeRecord($record),
            $record->counter,
            (bool) $record->backupEligible,
            (bool) $record->backupStatus,
        );

        return $this->sessionForUser((int) $row['user_id'], $request);
    }

    public function updateCredential(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $id = Input::positiveInt($input['id'] ?? null);
        if ($id === null) {
            throw new AuthException('VALIDATION_ERROR', 'Credential id is required.', 422);
        }

        $repository = new WebAuthnRepository($this->pdo);
        $repository->updateDeviceName(
            $id,
            (int) $session['user_id'],
            Input::string($input['deviceName'] ?? $input['device_name'] ?? null),
        );

        return ['credentials' => $repository->listForUser((int) $session['user_id'])];
    }

    public function deleteCredential(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $id = Input::positiveInt($input['id'] ?? null);
        if ($id === null) {
            throw new AuthException('VALIDATION_ERROR', 'Credential id is required.', 422);
        }

        $repository = new WebAuthnRepository($this->pdo);
        $repository->deleteCredential($id, (int) $session['user_id']);

        return ['credentials' => $repository->listForUser((int) $session['user_id'])];
    }

    private function creationOptions(string $challenge, array $user, array $excludeRows): PublicKeyCredentialCreationOptions
    {
        return PublicKeyCredentialCreationOptions::create(
            PublicKeyCredentialRpEntity::create('BudgetCentre', $this->rpId()),
            PublicKeyCredentialUserEntity::create(
                (string) $user['email'],
                $this->userHandle((int) $user['id']),
                (string) $user['display_name'],
            ),
            $challenge,
            [PublicKeyCredentialParameters::createPk(-7), PublicKeyCredentialParameters::createPk(-257)],
            AuthenticatorSelectionCriteria::create(
                AuthenticatorSelectionCriteria::AUTHENTICATOR_ATTACHMENT_PLATFORM,
                AuthenticatorSelectionCriteria::USER_VERIFICATION_REQUIREMENT_PREFERRED,
                AuthenticatorSelectionCriteria::RESIDENT_KEY_REQUIREMENT_PREFERRED,
            ),
            PublicKeyCredentialCreationOptions::ATTESTATION_CONVEYANCE_PREFERENCE_NONE,
            $this->descriptors($excludeRows),
            60000,
            hints: ['client-device'],
        );
    }

    private function requestOptions(string $challenge, array $credentialRows): PublicKeyCredentialRequestOptions
    {
        return PublicKeyCredentialRequestOptions::create(
            $challenge,
            $this->rpId(),
            $this->descriptors($credentialRows),
            PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED,
            60000,
            hints: ['client-device'],
        );
    }

    private function descriptors(array $credentialRows): array
    {
        return array_map(
            static function (array $row): PublicKeyCredentialDescriptor {
                $transports = json_decode((string) ($row['transports_json'] ?? '[]'), true);

                return PublicKeyCredentialDescriptor::create(
                    PublicKeyCredentialDescriptor::CREDENTIAL_TYPE_PUBLIC_KEY,
                    $row['credential_id'],
                    is_array($transports) ? $transports : [],
                );
            },
            $credentialRows,
        );
    }

    private function sessionForUser(int $userId, Request $request): array
    {
        $user = (new UserRepository($this->pdo))->findById($userId)
            ?? throw new AuthException('USER_NOT_FOUND', 'Active user was not found.', 404);
        $workspace = (new WorkspaceRepository($this->pdo))->firstForUser($userId);
        $token = $this->sessionManager->newToken();
        (new SessionRepository($this->pdo))->create(
            $userId,
            $this->sessionManager->hashToken($token),
            $request->ipAddress,
            $request->userAgent,
            $this->sessionManager->expiresAt(),
            $workspace === null ? null : (int) $workspace['id'],
        );
        $this->sessionManager->issueCookie($token);

        return [
            'user' => [
                'id' => (int) $user['id'],
                'email' => $user['email'],
                'username' => $user['username'] ?? null,
                'displayName' => $user['display_name'],
                'avatarUrl' => $user['avatar_url'] ?? null,
                'timezone' => $user['timezone'],
                'locale' => $user['locale'],
                'defaultPdfTheme' => BudgetPdfTheme::normalize($user['default_pdf_theme'] ?? null),
                'pdfExportSettings' => $this->pdfExportSettings($user['pdf_export_settings'] ?? null),
                'status' => $user['status'],
                'isAdmin' => isset($user['is_admin']) && (bool) $user['is_admin'],
                'emailVerifiedAt' => $user['email_verified_at'] ?? null,
            ],
            'workspace' => $workspace,
            'csrfToken' => $this->sessionManager->csrfToken($token),
        ];
    }

    private function pdfExportSettings(mixed $raw): array
    {
        if (is_string($raw) && trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : [];
        }

        if (!is_array($raw)) {
            $raw = [];
        }

        return [
            'showWorkspace' => (bool) ($raw['showWorkspace'] ?? $raw['show_workspace'] ?? false),
        ];
    }

    private function credentialFromInput(array $input): PublicKeyCredential
    {
        $credential = $input['credential'] ?? $input;
        if (!is_array($credential)) {
            throw new AuthException('VALIDATION_ERROR', 'Passkey credential payload is required.', 422);
        }

        return $this->serializer()->denormalize($credential, PublicKeyCredential::class, JsonEncoder::FORMAT);
    }

    private function ceremonyFactory(): CeremonyStepManagerFactory
    {
        $factory = new CeremonyStepManagerFactory();
        $factory->setAllowedOrigins([$this->origin()]);
        $factory->setSecuredRelyingPartyId(['localhost', '127.0.0.1']);

        return $factory;
    }

    private function normalizeOptions(PublicKeyCredentialCreationOptions|PublicKeyCredentialRequestOptions $options): array
    {
        return $this->serializer()->normalize($options, JsonEncoder::FORMAT);
    }

    private function serializeRecord(CredentialRecord $record): string
    {
        return $this->serializer()->serialize($record, JsonEncoder::FORMAT);
    }

    private function normalizeTrustPath(CredentialRecord $record): array
    {
        $normalized = $this->serializer()->normalize($record->trustPath, JsonEncoder::FORMAT);

        return is_array($normalized) ? $normalized : [];
    }

    private function serializer(): mixed
    {
        return (new WebauthnSerializerFactory(AttestationStatementSupportManager::create()))->create();
    }

    private function origin(): string
    {
        return rtrim(Env::string('APP_URL', 'http://localhost:5173') ?? 'http://localhost:5173', '/');
    }

    private function rpId(): string
    {
        $host = parse_url($this->origin(), PHP_URL_HOST);

        return is_string($host) && $host !== '' ? $host : 'localhost';
    }

    private function userHandle(int $userId): string
    {
        return "user:{$userId}";
    }
}
