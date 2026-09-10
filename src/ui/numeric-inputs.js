// Capture before field handlers so calculations and searches see cleaned values.
function numericInput(target) {
  return (
    target instanceof HTMLInputElement &&
    !target.readOnly &&
    (target.inputMode === 'numeric' || target.inputMode === 'decimal')
  );
}

document.addEventListener(
  'beforeinput',
  (event) => {
    if (!numericInput(event.target) || event.isComposing || !event.data) return;
    const allowed = event.target.inputMode === 'decimal' ? /^[0-9.]+$/ : /^[0-9]+$/;
    if (!allowed.test(event.data)) event.preventDefault();
  },
  true,
);

function cleanNumericInput(event) {
  const input = event.target;
  if (!numericInput(input) || event.isComposing) return;
  const value =
    input.inputMode === 'decimal'
      ? input.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
      : input.value.replace(/[^0-9]/g, '');
  if (value !== input.value) input.value = value;
}

document.addEventListener('input', cleanNumericInput, true);
document.addEventListener('compositionend', cleanNumericInput, true);
