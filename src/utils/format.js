function padTimePart(value) {
  return String(value).padStart(2, '0');
}

export function formatMatchTime(value) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = padTimePart(date.getMonth() + 1);
  const day = padTimePart(date.getDate());
  const hours = padTimePart(date.getHours());
  const minutes = padTimePart(date.getMinutes());

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
