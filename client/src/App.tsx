import { AppShell } from './components/layout/AppShell';
import { fixtures } from './data/fixtures';

export default function App() {
  return <AppShell initialMessages={fixtures} />;
}
