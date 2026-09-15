import { LoaderCircle } from "lucide-react";

export default function AgentProgress({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <div
      className={`message assistant progress-message ${className}`}
      role="status"
    >
      <span className="message-avatar">
        <LoaderCircle
          size={14}
          className="thinking-spinner"
          aria-hidden="true"
        />
      </span>
      <div>
        <span className="thinking">{text}</span>
      </div>
    </div>
  );
}
