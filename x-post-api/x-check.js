(() => {
  const composer = document.querySelector('div[data-testid="tweetTextarea_0"]');
  const button = document.querySelector('button[data-testid="tweetButtonInline"]');
  const account = document.querySelector('[data-testid=SideNav_AccountSwitcher_Button]');
  const toast = document.querySelector('[data-testid="toast"]');
  const text = composer ? (composer.innerText || '') : '';

  return JSON.stringify({
    composer: !!composer,
    draft: text.trim().length > 0,
    text: text,
    button: !!button,
    button_enabled: button ? !(button.disabled === true || button.getAttribute('aria-disabled') === 'true') : false,
    account: account ? (account.innerText || '') : '',
    toast: toast ? (toast.innerText || '') : ''
  });
})()
