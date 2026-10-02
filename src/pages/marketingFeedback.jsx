import { useEffect, useRef } from "react";
import { Notice } from "../components/UI";

import { marketingError } from "./marketingErrors";

export function MarketingFeedback({ message }) {
  const ref = useRef(null);
  useEffect(() => { if (message) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [message]);
  return message ? <div ref={ref} className="span-2" role="alert"><Notice type="error">{marketingError(message)}</Notice></div> : null;
}
