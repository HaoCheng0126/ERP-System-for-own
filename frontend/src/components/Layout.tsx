import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, Users, FileText, TrendingUp, LogOut, Truck, FileCheck, ShoppingCart, Menu, Settings, X } from 'lucide-react';
import { User, UserRole } from '../types';
import KinkoLogo from '../assets/logo-v5.png';

interface LayoutProps {
  children: React.ReactNode;
}

const allMenuItems = [
  { path: '/', label: '仪表盘', icon: LayoutDashboard, roles: [UserRole.ADMIN] },
  { path: '/employee-dashboard', label: '工作台', icon: LayoutDashboard, roles: [UserRole.PIECE_RATE] },
  { path: '/products', label: '产品管理', icon: Package, roles: [UserRole.ADMIN] },
  { path: '/customers', label: '客户管理', icon: Users, roles: [UserRole.ADMIN] },
  { path: '/inventory', label: '入库单', icon: FileText, roles: [UserRole.ADMIN, UserRole.PIECE_RATE] },
  { path: '/delivery', label: '送货单', icon: Truck, roles: [UserRole.ADMIN] },
  { path: '/purchase', label: '进货管理', icon: ShoppingCart, roles: [UserRole.ADMIN] },
  { path: '/statements', label: '对账管理', icon: FileCheck, roles: [UserRole.ADMIN] },
  { path: '/salary', label: '工资报表', icon: TrendingUp, roles: [UserRole.ADMIN, UserRole.PIECE_RATE] },
  { path: '/settings', label: '系统设置', icon: Settings, roles: [UserRole.ADMIN] },
];

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      setCurrentUser(JSON.parse(userStr));
    }
    const handleUserUpdated = () => {
      const latestUser = localStorage.getItem('user');
      if (latestUser) {
        setCurrentUser(JSON.parse(latestUser));
      }
    };
    window.addEventListener('user-updated', handleUserUpdated);
    return () => {
      window.removeEventListener('user-updated', handleUserUpdated);
    };
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  const filteredMenuItems = allMenuItems.filter(item => 
    currentUser && item.roles.includes(currentUser.role)
  );
  const profilePath = '/employee-system';

  return (
    <div className="flex h-screen bg-[#F5F6F7] relative">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-[#DEE0E3] z-20 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <img src={KinkoLogo} alt="Kinko Logo" className="w-6 h-6 rounded-md" />
          <h1 className="text-base font-semibold text-[#1F2329]">Kinko企业管理系统</h1>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-1">
          {isMobileMenuOpen ? <X className="w-6 h-6 text-[#1F2329]" /> : <Menu className="w-6 h-6 text-[#1F2329]" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside 
        className={`
          fixed md:static inset-y-0 left-0 z-30 w-64 bg-[#F2F3F5] flex flex-col border-r border-[#DEE0E3] transition-transform duration-300 ease-in-out
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="p-4 flex items-center gap-3 md:flex hidden">
          <img src={KinkoLogo} alt="Kinko Logo" className="w-9 h-9 rounded-lg" />
          <h1 className="text-lg font-semibold text-[#1F2329]">Kinko企业管理系统</h1>
        </div>
        
        {/* Mobile menu header padding */}
        <div className="h-14 md:hidden"></div>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          <ul className="space-y-1">
            {filteredMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm ${
                      isActive
                        ? 'bg-[#E1E4E8] text-[#3370FF] font-medium'
                        : 'text-[#646A73] hover:bg-[#EAEBEC] hover:text-[#1F2329]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-3 border-t border-[#DEE0E3]">
          {currentUser && (
            <Link
              to={profilePath}
              className="flex items-center gap-3 px-2 py-2 mb-2 rounded-md hover:bg-[#EAEBEC] transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-[#7E6BF6] text-white flex items-center justify-center text-sm font-medium">
                {currentUser.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#1F2329] truncate">{currentUser.name}</div>
                <div className="text-xs text-[#8F959E] truncate">
                  {currentUser.role === UserRole.ADMIN ? '管理员' : '计件工人'}
                </div>
              </div>
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-2 py-2 text-[#F54A45] hover:bg-[#FFF1F0] rounded-md transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-white m-2 rounded-lg shadow-sm border border-[#DEE0E3] mt-16 md:mt-2">
        {children}
      </main>
    </div>
  );
};

export default Layout;
