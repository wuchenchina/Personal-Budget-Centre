# PDF Font Assets

PDF export uses local font files from this directory. The actual font binaries are
not committed because many system fonts are not redistributable, except the
redistributable Noto Sans CJK KR Korean fallback bundled under the SIL Open Font License.

Add compatible fonts with these filenames before building Docker images or
exporting PDFs locally:

- Arial.ttf
- Arial Bold.ttf
- Menlo.ttc
- PingFang-HK-Regular.ttf
- PingFang-HK-Semibold.ttf
- PingFang-SC-Regular.ttf
- PingFang-SC-Semibold.ttf
- SF-Mono-Regular.ttf
- SF-Mono-Bold.ttf
- SF-Mono-Light.ttf
- Times New Roman.ttf
- Times New Roman Bold.ttf
- Songti-SC-Regular.ttf
- Songti-SC-Bold.ttf
- Songti-TC-Regular.ttf
- Songti-TC-Bold.ttf

You may use your system-installed copies, or adapt the PDF theme code to use
fonts with licenses suitable for your deployment.

## Korean PDF fallback

`NotoSansCJKkr-Regular.otf` is distributed with the renderer and its license is
in `NotoSansCJK-LICENSE.txt`. Source: https://github.com/notofonts/noto-cjk/tree/main/Sans/OTF/Korean.
It is used only when the existing fonts cannot render a character. Existing
fonts take precedence. The SVG signature block also registers this fallback.
The build and Docker publish include the font so deployments do not depend on
a Korean font installed on the host. Rebuild and restart the PDF worker after
updating; previously generated exports must be generated again.
