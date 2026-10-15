import { Upload } from "lucide-react";

export default function UploadPicker({ label, file, onChange, accept, disabled = false, capture }) {
  return <label className={`upload-picker${disabled ? " is-disabled" : ""}`} title={label}>
    <input type="file" accept={accept} capture={capture} disabled={disabled}
      aria-label={label} onChange={event => onChange(event.target.files?.[0] || null)} />
    <span className="upload-picker__icon"><Upload size={18} aria-hidden="true" /></span>
    {file?.name && <span className="upload-picker__name" title={file.name}>{file.name}</span>}
  </label>;
}
