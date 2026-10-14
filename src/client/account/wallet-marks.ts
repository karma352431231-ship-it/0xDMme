const marks = new Map([
  ['MetaMask', '/wallet-metamask.svg'],
  ['Phantom', '/wallet-phantom.svg'],
  ['Backpack', '/wallet-backpack.png'],
]);

/** Same-origin, reviewed brand assets only. Provider strings never become URLs. */
export function mountWalletMark(button: HTMLButtonElement): void {
  const brand = button.dataset['walletBrand'];
  const path = brand ? marks.get(brand) : undefined;
  if (!path || button.querySelector('.wallet-mark')) return;
  const image = document.createElement('img');
  image.className = 'wallet-mark';
  image.src = path;
  image.alt = '';
  image.width = 32;
  image.height = 32;
  image.setAttribute('aria-hidden', 'true');
  button.classList.add('has-wallet-mark');
  button.prepend(image);
}
