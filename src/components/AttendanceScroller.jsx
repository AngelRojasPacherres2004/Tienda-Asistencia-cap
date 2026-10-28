import "./attendance-scroller.css";

export default function AttendanceScroller({ children }) {
  return <div className="attendance-scroller">
    <div className="attendance-scroll attendance-scroller__viewport" tabIndex={0} role="region" aria-label="Lista de asistencias con desplazamiento horizontal y vertical">
      {children}
    </div>
  </div>;
}
