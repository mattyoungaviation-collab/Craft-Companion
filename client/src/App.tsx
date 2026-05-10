import { BrowserRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import CreateAccount from './pages/CreateAccount';
import Landing from './pages/Landing';
import MyHome from './pages/MyHome';
import Profitability from './pages/Profitability';
import SignIn from './pages/SignIn';

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
          path="/profitability"
          element={(
            <ProtectedRoute>
              <Profitability />
            </ProtectedRoute>
          )}
        />
      </Routes>
    </BrowserRouter>
  );
}
