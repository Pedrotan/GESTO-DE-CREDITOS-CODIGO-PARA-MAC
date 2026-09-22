import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from "@/componentes/ui/toaster";
import LoginAdmin from '@/paginas/Admin/LoginAdmin';
import DashboardAdmin from '@/paginas/Admin/DashboardAdmin';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/componentes/ui/tooltip";
import { MasterProtectedRoute } from './MasterProtectedRoute';

const queryClient = new QueryClient();

function AppAdmin() {
    return (
        <QueryClientProvider client={queryClient}>
            <TooltipProvider>
                <Router>
                    <Routes>
                        <Route path="/login" element={<LoginAdmin />} />
                        <Route
                            path="/dashboard"
                            element={
                                <MasterProtectedRoute>
                                    <DashboardAdmin />
                                </MasterProtectedRoute>
                            }
                        />
                        <Route path="*" element={<Navigate to="/dashboard" />} />
                    </Routes>
                    <Toaster />
                </Router>
            </TooltipProvider>
        </QueryClientProvider>
    );
}

export default AppAdmin;
