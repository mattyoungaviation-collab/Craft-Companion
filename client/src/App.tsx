import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing'; import CreateAccount from './pages/CreateAccount'; import SignIn from './pages/SignIn'; import MyHome from './pages/MyHome'; import ProtectedRoute from './components/ProtectedRoute';
export default function App(){return <BrowserRouter><Routes><Route path='/' element={<Landing/>}/><Route path='/register' element={<CreateAccount/>}/><Route path='/signin' element={<SignIn/>}/><Route path='/home' element={<ProtectedRoute><MyHome/></ProtectedRoute>}/></Routes></BrowserRouter>}
