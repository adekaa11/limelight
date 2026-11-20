import { useEffect, useState } from "react";
import { getServerState, onServerState, type ServerState } from "../api";

export function useServerState(): ServerState {
  const [s, set] = useState(getServerState);
  useEffect(() => onServerState(set), []);
  return s;
}
