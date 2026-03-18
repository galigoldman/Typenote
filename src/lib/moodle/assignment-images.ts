export function processAssignmentImageUrls(
  descriptionHtml: string,
  moodleDomain: string,
): string {
  const imgRegex = /<img([^>]+)src="([^"]*)"([^>]*)>/gi;
  let processed = descriptionHtml;
  let match;

  while ((match = imgRegex.exec(descriptionHtml)) !== null) {
    const src = match[2];
    if (src.includes(moodleDomain) || src.startsWith('/')) {
      const absoluteSrc = src.startsWith('/')
        ? `https://${moodleDomain}${src}`
        : src;
      const original = match[0];
      const updated = original
        .replace(src, absoluteSrc)
        .replace('<img', '<img data-moodle-image="true"');
      processed = processed.replace(original, updated);
    }
  }

  return processed;
}
