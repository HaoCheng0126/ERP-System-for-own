import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Inventory from './pages/Inventory';
import Salary from './pages/Salary';
import Settings from './pages/Settings';
import Delivery from './pages/Delivery';
import Purchase from './pages/Purchase';
import Returns from './pages/Returns';
import Statement from './pages/Statement';
import EmployeeDashboard from './pages/EmployeeDashboard';
import EmployeeSystem from './pages/EmployeeSystem';
import { UserRole } from './types';
import { isAuthenticated, getUserRole } from './utils/auth';

// 受保护的路由组件
const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: UserRole[] }) => {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  const role = getUserRole();
  if (allowedRoles && role) {
    if (!allowedRoles.includes(role)) {
      return <Navigate to="/" replace />;
    }
  }

  return children;
};

// 仪表盘路由组件 (带重定向)
const DashboardRoute = () => {
  const role = getUserRole();
  if (role === UserRole.PIECE_RATE) {
    return <Navigate to="/employee-dashboard" replace />;
  }
  return <Dashboard />;
};

function App() {
  useEffect(() => {
    const handleInputFocus = (e: FocusEvent) => {
      const target = e.target as HTMLInputElement;
      if (target.tagName === 'INPUT' && (target.type === 'number' || target.dataset.isNumberInput === 'true')) {
        if (target.value === '0' || target.value === '') {
          target.value = '';
        }
      }
    };

    const handleInputBlur = (e: FocusEvent) => {
      const target = e.target as HTMLInputElement;
      if (target.tagName === 'INPUT' && (target.type === 'number' || target.dataset.isNumberInput === 'true')) {
        if (target.value === '' || target.value === '0') {
          target.value = '0';
        }
      }
    };

    document.addEventListener('focusin', handleInputFocus);
    document.addEventListener('focusout', handleInputBlur);

    return () => {
      document.removeEventListener('focusin', handleInputFocus);
      document.removeEventListener('focusout', handleInputBlur);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><DashboardRoute /></ProtectedRoute>} />
        <Route path="/employee-dashboard" element={<ProtectedRoute allowedRoles={[UserRole.PIECE_RATE]}><EmployeeDashboard /></ProtectedRoute>} />
        <Route path="/employee-system" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.PIECE_RATE]}><EmployeeSystem /></ProtectedRoute>} />
        
        {/* 管理员专用路由 */}
        <Route path="/products" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><Products /></ProtectedRoute>} />
        <Route path="/customers" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><Customers /></ProtectedRoute>} />
        <Route path="/delivery" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><Delivery /></ProtectedRoute>} />
        <Route path="/purchase" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><Purchase /></ProtectedRoute>} />
        <Route path="/returns" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><Returns /></ProtectedRoute>} />
        <Route path="/statements" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><Statement /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><Settings /></ProtectedRoute>} />
        
        {/* 通用路由 (内部根据角色显示不同内容) */}
        <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
        <Route path="/salary" element={<ProtectedRoute><Salary /></ProtectedRoute>} />
      </Routes>
    </div>
  );
}

export default App;
