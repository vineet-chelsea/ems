import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { EnergyDashboard } from "@/components/EnergyDashboard";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  if (!user) {
    return null;
  }

  return <EnergyDashboard />;
};

export default Index;
