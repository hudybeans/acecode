import { useMemo } from 'react';
import logoSvg from '../../../assets/branding/acecode-icon.svg?raw';
import { useTheme } from '../theme.jsx';
import { themeLogoDataUrl } from '../lib/brandLogoColors.js';

export default function BrandLogo(props) {
  const { appearance } = useTheme();
  const color = appearance?.logoColor;
  const src = useMemo(() => color ? themeLogoDataUrl(logoSvg, color) : '/acecode-logo.png', [color]);
  return <img alt="" draggable="false" {...props} src={src} data-custom-logo={color ? 'true' : undefined} />;
}
