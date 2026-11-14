export function isPersonLabel(label: string) {
  return ['person', '사람'].includes(label.trim().toLowerCase());
}
