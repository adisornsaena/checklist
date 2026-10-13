// ไอคอนรายการตรวจสอบ (checklist) แบบเส้น
export default function ChecklistIcon({ size = 24, className = '' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="2.5" width="17" height="19" rx="2.5" />
      <path d="M6.8 7.2l1.2 1.2 2.2-2.4M6.8 12.2l1.2 1.2 2.2-2.4M6.8 17.2l1.2 1.2 2.2-2.4" />
      <path d="M13 7.4h4.2M13 12.4h4.2M13 17.4h4.2" />
    </svg>
  );
}
