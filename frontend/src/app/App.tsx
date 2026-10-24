import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthContext'
import AppRouter from './router'
import { EcDialogHost } from '../components/EcDialog'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        {/* 화면 안 '알림' 창 — 브라우저 기본 alert · confirm 대신(components/EcDialog) */}
        <EcDialogHost />
      </AuthProvider>
    </BrowserRouter>
  )
}
