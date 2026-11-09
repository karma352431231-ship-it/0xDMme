import { installNativeProductActions } from './native-product-actions.ts';
import { installNativeProductDiagnostics } from './native-product-diagnostics.ts';

installNativeProductDiagnostics();
installNativeProductActions();
await import('./wallet-browser.ts');
