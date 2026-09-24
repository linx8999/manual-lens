import { useEffect } from "react";
import { AppShell } from "./components/AppShell";
import { appStore } from "./store";

export function App(): React.JSX.Element {
  useEffect(() => {
    void appStore.getState().bootstrap();
    return () => appStore.getState().dispose();
  }, []);

  return <AppShell />;
}
