const { transliterate } = require('transliteration');

function spokenToEmail(spoken) {
  if (!spoken) return '';

  // Step 1: Normalize case
  let text = spoken.toLowerCase().trim();

  // Step 2: Replace spoken connectors
  const replacements = {
    ' at the rate ': '@',
    ' at ': '@',
    ' dot ': '.',
    ' underscore ': '_',
    ' dash ': '-',
    ' hyphen ': '-',
    ' space ': '',
    ' gmail ': 'gmail',
    ' yahoo ': 'yahoo',
    ' hotmail ': 'hotmail',
    ' outlook ': 'outlook',
  };

  for (const [key, val] of Object.entries(replacements)) {
    text = text.replaceAll(key, val);
  }

  // Step 3: Transliterate Hindi to English
  text = transliterate(text);

  // Step 4: Fix double vowels (normalize transliteration)
  text = text
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'e')
    .replace(/ii/g, 'i')
    .replace(/oo/g, 'o')
    .replace(/uu/g, 'u');

  // Step 5: Convert spoken numbers (English)
  const numberMap = {
    zero: '0',
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9',
  };

  Object.entries(numberMap).forEach(([word, digit]) => {
    // Replace word even if it's attached to others (like "nine three")
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    text = text.replace(regex, digit);
  });

  // Step 6: Remove all spaces
  text = text.replace(/\s+/g, '');

  // Step 7: Fix partial replacements like "thre" (caused by transliteration)
  text = text.replace(/thre/g, '3');

  return text;
}

module.exports = spokenToEmail;
