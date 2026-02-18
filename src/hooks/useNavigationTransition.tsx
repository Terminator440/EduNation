import { createContext, useContext, useTransition, useState, useCallback, useEffect, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";

interface NavigationTransitionContextType {
  isPending: boolean;
  navigate: (to: string) => void;
  activePath: string;
}

const NavigationTransitionContext = createContext<NavigationTransitionContextType | undefined>(undefined);

export function NavigationTransitionProvider({ children }: { children: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Optimistic active path - updates instantly for UI responsiveness
  const [activePath, setActivePath] = useState(location.pathname);

  // Sync activePath with location when navigation completes
  useEffect(() => {
    setActivePath(location.pathname);
  }, [location.pathname]);

  // Navigate with transition - active state updates instantly, page content renders with low priority
  const handleNavigate = useCallback((to: string) => {
    // Update active state instantly (optimistic update)
    setActivePath(to);
    
    // Navigate with low priority transition
    startTransition(() => {
      navigate(to);
    });
  }, [navigate, startTransition]);

  return (
    <NavigationTransitionContext.Provider
      value={{
        isPending,
        navigate: handleNavigate,
        activePath,
      }}
    >
      {children}
    </NavigationTransitionContext.Provider>
  );
}

export function useNavigationTransition() {
  const context = useContext(NavigationTransitionContext);
  if (context === undefined) {
    throw new Error("useNavigationTransition must be used within NavigationTransitionProvider");
  }
  return context;
}
