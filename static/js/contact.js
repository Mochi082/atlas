// Contact-only character counter.
const messageField = document.querySelector('textarea[name="message"]');
const charCount = document.querySelector('.char-count');
function updateCount() { if (messageField && charCount) charCount.textContent = `${messageField.value.length} / 3000`; }
messageField?.addEventListener('input', updateCount);
updateCount();

// Contact form prototype: IME-safe filtering and confirmation flow.
const contactForm = document.querySelector('#contact-form');
const contactRoutes = document.body.dataset;
const contactStorageKey = 'atlasContactDraft';
const typeLabels = {
  'product-partner': '協業・業務提携',
  'onsite-corporate': 'オンサイトアウトソーシング（法人の方）',
  'onsite-freelance': 'オンサイトアウトソーシング（個人事業主様）',
  'sme-sales': '売り上げを上げたい（ITコンサル）',
  'sme-cost': '経費を削減したい（ITコンサル）',
  'sme-productivity': '生産性を向上したい（ITコンサル）',
  'sme-security': 'セキュリティ対策をしたい（ITコンサル）',
  services: '弊社のサービスについて',
  recruit: '採用について',
  other: 'その他'
};
const companyRequiredTypes = new Set(['onsite-corporate', 'product-partner']);

// Storage can contain old or malformed drafts; only restore the expected shape.
function readContactDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(contactStorageKey) || 'null');
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;
    if (['type','name','kana','company','department','email','tel','message']
      .some(key => draft[key] != null && typeof draft[key] !== 'string')) return null;
    return {...draft, consent: draft.consent === true};
  } catch (_) { return null; }
}


const contactFilters = {
  kana: value => value.normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, char => String.fromCharCode(char.charCodeAt(0) + 0x60))
    .replace(/[^ァ-ヶー\s　]/g, ''),
  tel: value => value
    .replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
    .replace(/\D/g, '')
};

function formatJapanesePhone(value) {
  const digits = contactFilters.tel(value);
  if (!digits) return '';
  if (digits.length > 11) return digits;

  // Common mobile/IP phone numbers: 070/080/090/050-XXXX-XXXX
  if (/^(050|070|080|090)/.test(digits) && !digits.startsWith('0800')) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0,3)}-${digits.slice(3)}`;
    return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
  }

  // Tokyo/Osaka: 03/06-XXXX-XXXX
  if (/^(03|06)/.test(digits)) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `${digits.slice(0,2)}-${digits.slice(2)}`;
    return `${digits.slice(0,2)}-${digits.slice(2,6)}-${digits.slice(6)}`;
  }

  // Toll-free / Navi Dial: 0120/0800/0570.
  if (/^(0120|0800|0570)/.test(digits)) {
    const head = 4;
    if (digits.length <= head) return digits;
    const middleLength = 3;
    if (digits.length <= head + middleLength) return `${digits.slice(0,head)}-${digits.slice(head)}`;
    return `${digits.slice(0,head)}-${digits.slice(head,head+middleLength)}-${digits.slice(head+middleLength)}`;
  }

  // Other area codes vary in Japan, so keep digits while typing instead of guessing a wrong split.
  return digits;
}

document.querySelectorAll('[data-filter]').forEach(input => {
  const filter = contactFilters[input.dataset.filter];
  let composing = false;
  const normalize = () => {
    if (composing) return;
    const start = input.selectionStart, end = input.selectionEnd;
    const before = input.value;
    const next = input.dataset.filter === 'tel' ? formatJapanesePhone(before) : filter(before);
    if (next !== before) {
      input.value = next;
      if (start != null && input.dataset.filter !== 'tel') input.setSelectionRange(filter(before.slice(0,start)).length,filter(before.slice(0,end)).length);
    }
    input.dispatchEvent(new Event('contactvalidate', { bubbles:true }));
  };
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; if (input.dataset.filter !== 'tel') normalize(); });
  input.addEventListener('input', event => { if (!event.isComposing && input.dataset.filter !== 'tel') normalize(); });
  input.addEventListener('blur', normalize);
});

function syncCompanyRequirement() {
  if (!contactForm) return;
  const company = contactForm.elements.company;
  const department = contactForm.elements.department;
  const type = contactForm.elements.type?.value || '';
  const required = companyRequiredTypes.has(type);
  const badge = contactForm.querySelector('.company-required');
  const departmentBadge = contactForm.querySelector('.department-required');
  company.required = required;
  department.required = false;
  if (badge) badge.hidden = !required;
  if (departmentBadge) departmentBadge.hidden = true;
}
contactForm?.elements.type?.addEventListener('change', syncCompanyRequirement);

function restoreContactDraft() {
  if (!contactForm) return;
  const params = new URLSearchParams(location.search);
  const draft = readContactDraft() || {};

  if (Object.keys(draft).length) {
    ['type','name','kana','company','department','email','tel','message'].forEach(key => {
      if (contactForm.elements[key] && draft[key] != null) contactForm.elements[key].value = draft[key];
    });
    if (contactForm.elements.consent) contactForm.elements.consent.checked = Boolean(draft.consent);
  }

  const requestedType = params.get('type');
  if (requestedType && typeLabels[requestedType] && contactForm.elements.type) {
    contactForm.elements.type.value = requestedType;
  }
  syncCompanyRequirement();
  updateCount();
}
restoreContactDraft();

function clearContactErrors() {
  if (!contactForm) return;
  const errorIds = new Set([...contactForm.querySelectorAll('.field-error')].map(el => el.id));
  contactForm.querySelectorAll('[aria-describedby]').forEach(field => {
    const remaining = field.getAttribute('aria-describedby').split(/\s+/).filter(id => !errorIds.has(id));
    if (remaining.length) field.setAttribute('aria-describedby', remaining.join(' '));
    else field.removeAttribute('aria-describedby');
  });
  contactForm.querySelectorAll('.field-error').forEach(el => el.remove());
  contactForm.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
  contactForm.querySelectorAll('[aria-invalid="true"]').forEach(el => el.removeAttribute('aria-invalid'));
  const legacyError = document.querySelector('#form-error');
  if (legacyError) legacyError.textContent = '';
}

function showContactError(field, message) {
  if (!field) return;
  const container = field.closest('label') || field.closest('.consent-box') || field.parentElement;
  if (!container) return;
  field.setAttribute('aria-invalid', 'true');
  container.classList.add('has-error');
  const error = document.createElement('small');
  error.className = 'field-error';
  error.id = `contact-${field.name}-error`;
  error.textContent = message;
  const descriptions = new Set((field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  descriptions.add(error.id);
  field.setAttribute('aria-describedby', [...descriptions].join(' '));
  if (field.type === 'checkbox') {
    const consentLabel = field.closest('.consent');
    consentLabel?.insertAdjacentElement('afterend', error);
  } else {
    field.insertAdjacentElement('afterend', error);
  }
}

function validateContactData(data) {
  const errors = [];
  const name = (data.name || '').trim();
  const nameLength = Array.from(name).length;
  const nameCharactersOk = /^[\p{L}\p{M}\s・･.'’ʼ\-‐‑]+$/u.test(name);
  const kana = (data.kana || '').trim();
  const kanaLength = Array.from(kana).length;
  const kanaOk = /^[ァ-ヶー\s　]+$/.test(kana) && kanaLength >= 2 && kanaLength <= 50;
  const telOk = /^0\d{9,10}$/.test((data.tel || '').replace(/\D/g, ''));
  const email = document.createElement('input');
  email.type = 'email';
  email.value = data.email || '';
  const emailOk = email.validity.valid && email.value.length >= 6 && email.value.length <= 254;
  const companyRequired = companyRequiredTypes.has(data.type);

  if (!data.type) errors.push(['type', 'お問い合わせの種類を選択してください。']);
  if (nameLength < 2 || nameLength > 50) errors.push(['name', 'お名前は2〜50文字で入力してください。']);
  else if (!nameCharactersOk) errors.push(['name', 'お名前に使用できない文字が含まれています。文字・空白・中点・ハイフンなどで入力してください。']);
  if (!kanaOk) errors.push(['kana', 'フリガナは2〜50文字のカタカナで入力してください。']);
  if (companyRequired && !(data.company || '').trim()) errors.push(['company', '会社名を入力してください。']);
  if (!emailOk) errors.push(['email', 'メールアドレスを正しく入力してください。']);
  if (!telOk) errors.push(['tel', '電話番号を正しく入力してください。']);
  if ((data.message || '').trim().length < 10) errors.push(['message', 'お問い合わせ内容を10文字以上入力してください。']);
  if (!data.consent) errors.push(['consent', '個人情報の取り扱いへの同意が必要です。']);
  return errors;
}

function validateContact() {
  const data = Object.fromEntries(new FormData(contactForm).entries());
  data.consent = contactForm.elements.consent.checked;
  const fields = Object.fromEntries(['type','name','kana','company','department','email','tel','message','consent']
    .map(key => [key, contactForm.elements[key]]));
  return {data, errors: validateContactData(data).map(([key, message]) => [fields[key], message])};
}

function saveContactDraft() {
  try {
    const data = Object.fromEntries(new FormData(contactForm).entries());
    data.consent = contactForm.elements.consent.checked;
    sessionStorage.setItem(contactStorageKey, JSON.stringify(data));
  } catch (_) {
    const status = document.getElementById('form-error');
    if (status) status.textContent = '下書きを保存できません。このページを離れると入力内容が失われる場合があります。';
  }
}
function refreshContactErrors(event) {
  if (event.isComposing) return;
  syncCompanyRequirement();
  const previous = new Set([...contactForm.querySelectorAll('[aria-invalid="true"]')].map(field => field.name));
  const {errors} = validateContact();
  clearContactErrors();
  errors.filter(([field]) => previous.has(field.name)).forEach(([field,message]) => showContactError(field,message));
  saveContactDraft();
}
['input','change','contactvalidate'].forEach(type => contactForm?.addEventListener(type,refreshContactErrors));

contactForm?.addEventListener('submit', event => {
  event.preventDefault();
  syncCompanyRequirement();
  clearContactErrors();

  const {data,errors} = validateContact();

  errors.forEach(([field, message]) => showContactError(field, message));

  if (errors.length) {
    const firstField = errors[0][0];
    const target = firstField.closest('label') || firstField.closest('.consent-box') || firstField;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => firstField.focus({ preventScroll: true }), 350);
    return;
  }

  try {
    sessionStorage.setItem(contactStorageKey, JSON.stringify(data));
  } catch (_) {
    const status = document.getElementById('form-error');
    if (status) status.textContent = '入力内容を確認画面へ引き継げませんでした。ブラウザーの設定を確認して、もう一度お試しください。';
    return;
  }
  location.href = contactRoutes.contactConfirmUrl;
});

// Enable the prototype continuation only after its submit handler is attached.
if (contactForm) contactForm.querySelector('.form-submit').disabled = false;
const confirmList = document.querySelector('#confirm-list');
if (confirmList) {
  const sendButton = document.getElementById('contact-send');
  const confirmationError = document.getElementById('confirm-error');
  function refreshConfirmation() {
    const draft = readContactDraft();
    const errors = draft && typeof draft === 'object' ? validateContactData(draft) : [['draft', '入力内容を確認できません。入力画面からやり直してください。']];
    const valid = errors.length === 0;
    sendButton.disabled = !valid;
    confirmationError.hidden = valid;
    if (!valid) confirmationError.textContent = '入力内容または同意を確認できません。修正するを押して入力画面でご確認ください。';
    if (!draft || typeof draft !== 'object') return;
    const values = {
      type: typeLabels[draft.type] || draft.type || '—',
      name: draft.name || '—',
      kana: draft.kana || '—',
      company: draft.company || '—',
      department: draft.department || '—',
      email: draft.email || '—',
      tel: draft.tel || '—',
      message: draft.message || '—'
    };
    Object.entries(values).forEach(([key, value]) => {
      const target = confirmList.querySelector(`[data-confirm="${key}"]`);
      if (target) target.textContent = value;
    });
  }
  refreshConfirmation();
  window.addEventListener('pageshow', refreshConfirmation);
  sendButton?.addEventListener('click', event => {
    refreshConfirmation();
    if (sendButton.disabled) event.preventDefault();
  });
}

document.querySelector('#contact-send')?.addEventListener('click', event => {
  if (document.querySelector('#contact-send').disabled) { event.preventDefault(); return; }
  // Prototype transition only. Replace with confirmed server acceptance before publishing.
  try { sessionStorage.removeItem(contactStorageKey); } catch (_) {}
  location.href = contactRoutes.contactCompleteUrl;
});
