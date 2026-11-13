// Credential collection templates — the knowledge base of "Al-Amin IP Access".
// Each field carries Bengali step-by-step guidance so clients can find/create
// their own tokens & IDs without the agency chasing them.

export interface CredentialField {
  key: string;
  label: string; // English technical label (e.g. "Page Access Token")
  labelBn: string; // Bengali label
  descBn: string; // what it is & why the agency needs it
  steps: string[]; // Bengali how-to steps (numbered in UI)
  helpUrl?: string; // official link
  placeholder?: string;
  required?: boolean; // default true
  sensitive?: boolean; // default true — masked input, hidden in admin list
  kind?: 'input' | 'textarea';
}

export interface PlatformTemplate {
  key: string;
  name: string;
  nameBn: string;
  taglineBn: string; // why this platform matters for leads/sales
  guideBn: string; // section-level intro
  gradient: string; // tailwind gradient for the icon chip
  icon: string; // key in platform-icons map
  fields: CredentialField[];
}
