(() => {
  const phase = __PHASE__;
  const text = __TEXT_JSON__;
  const composer = document.querySelector('div[data-testid="tweetTextarea_0"]');
  if (!composer) return JSON.stringify({ ok: false, error: 'NO_COMPOSER' });

  const normalize = (value) => {
    return (value || '')
      .replace(/\r\n/g, '\n')
      .replace(/\u200b/g, '')
      .replace(/\t/g, ' ')
      .replace(/\s+$/g, '')
      .trim();
  };

  if (phase === 'fill') {
    const existing = (composer.innerText || '').trim();
    if (existing.length > 0) return JSON.stringify({ ok: false, error: 'DRAFT_EXISTS' });

    composer.focus();
    document.execCommand('selectAll');
    document.execCommand('delete');
    document.execCommand('insertText', false, text);

    const actual = composer.innerText || '';
    if (normalize(actual) !== normalize(text)) {
      composer.focus();
      document.execCommand('selectAll');
      document.execCommand('delete');
      return JSON.stringify({ ok: false, error: 'INPUT_MISMATCH', actual: actual });
    }
    return JSON.stringify({ ok: true });
  }

  if (phase === 'click') {
    const button = document.querySelector('button[data-testid="tweetButtonInline"]');
    if (!button) return JSON.stringify({ ok: false, error: 'NO_BUTTON' });
    if (button.disabled === true || button.getAttribute('aria-disabled') === 'true') {
      return JSON.stringify({ ok: false, error: 'BUTTON_DISABLED' });
    }
    button.click();
    return JSON.stringify({ ok: true });
  }

  return JSON.stringify({ ok: false, error: 'INVALID_PHASE' });
})()
