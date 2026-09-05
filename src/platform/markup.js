// Values embedded in a quoted inline-handler argument cross both HTML and JS parsers.
export function escapeHandlerArgument(value) {
  return String(value ?? '').replace(
    /[\\'"<>&\r\n\u2028\u2029]/g,
    (character) => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}
