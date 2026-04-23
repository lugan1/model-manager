import { useLogContext } from "../contexts/LogContext";

export const useErrorLogs = () => {
  return useLogContext();
};
