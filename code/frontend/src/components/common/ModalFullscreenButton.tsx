import { Button, Tooltip } from 'antd';
import type { Dispatch, SetStateAction } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useI18n } from '../../i18n';

interface ModalFullscreenButtonProps {
  fullscreen: boolean;
  setFullscreen: Dispatch<SetStateAction<boolean>>;
}

export function ModalFullscreenButton({
  fullscreen,
  setFullscreen,
}: ModalFullscreenButtonProps) {
  const { t } = useI18n();

  return (
    <Tooltip title={fullscreen ? t('exitFullscreen') : t('fullscreen')}>
      <Button
        icon={fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        size="small"
        type="text"
        onClick={() => setFullscreen((current) => !current)}
      />
    </Tooltip>
  );
}
