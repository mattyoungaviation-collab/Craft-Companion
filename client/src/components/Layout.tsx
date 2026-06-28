import { Link } from 'react-router-dom';
import { logout } from '../services/api';

export default function Layout({ children }: { children: any }) {
  return (
    <div>
      <nav className="flex justify-between border-b border-slate-800 p-4">
        <Link to="/home">Craftworld Companion</Link>
        <div className="space-x-4">
          <Link to="/home">My Home</Link>
          <Link to="/empire-dashboard">Empire</Link>
          <Link to="/resource-planner">Planner</Link>
          <Link to="/profitability">Profitability</Link>
          <Link to="/calculator">Calculator</Link>
          <Link to="/inventory-value">Inventory Value</Link>
          <Link to="/upgrade-advisor">Upgrade Advisor</Link>
          <Link to="/compare">Compare</Link>
          <Link to="/timers">Timers</Link>
          <Link to="/matrix">Matrix</Link>
          <Link to="/settings">Settings</Link>
          <button
            onClick={() => {
              logout();
              location.href = '/signin';
            }}
          >
            Sign Out
          </button>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
