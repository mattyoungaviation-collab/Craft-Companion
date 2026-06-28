import { BrowserRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Calculator from './pages/Calculator';
import CreateAccount from './pages/CreateAccount';
import EmpireDashboard from './pages/EmpireDashboard';
import FactoryCompare from './pages/FactoryCompare';
import FactoryTimers from './pages/FactoryTimers';
import InventoryValue from './pages/InventoryValue';
import Landing from './pages/Landing';
import Matrix from './pages/Matrix';
import MyHome from './pages/MyHome';
import Profitability from './pages/Profitability';
import ResourcePlanner from './pages/ResourcePlanner';
import Settings from './pages/Settings';
import SignIn from './pages/SignIn';
import UpgradeAdvisor from './pages/UpgradeAdvisor';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/register" element={<CreateAccount />} />
        <Route path="/signin" element={<SignIn />} />
        <Route
          path="/home"
          element={(
            <ProtectedRoute>
              <MyHome />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/empire-dashboard"
          element={(
            <ProtectedRoute>
              <EmpireDashboard />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/resource-planner"
          element={(
            <ProtectedRoute>
              <ResourcePlanner />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/profitability"
          element={(
            <ProtectedRoute>
              <Profitability />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/calculator"
          element={(
            <ProtectedRoute>
              <Calculator />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/inventory-value"
          element={(
            <ProtectedRoute>
              <InventoryValue />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/upgrade-advisor"
          element={(
            <ProtectedRoute>
              <UpgradeAdvisor />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/matrix"
          element={(
            <ProtectedRoute>
              <Matrix />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/compare"
          element={(
            <ProtectedRoute>
              <FactoryCompare />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/timers"
          element={(
            <ProtectedRoute>
              <FactoryTimers />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/settings"
          element={(
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          )}
        />
      </Routes>
    </BrowserRouter>
  );
}
