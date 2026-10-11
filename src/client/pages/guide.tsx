import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { legacyGuideDestination } from "../../shared/docs";
import { DocArticlePage } from "./docs";

// Keep historical WeChat links useful, including hashes that the server cannot see.
// The static fallback still renders the guide and navigation for readers without JS.
export function Guide() {
  const { hash } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(legacyGuideDestination(hash), { replace: true });
  }, [hash, navigate]);
  return <DocArticlePage slug="getting-started" />;
}
