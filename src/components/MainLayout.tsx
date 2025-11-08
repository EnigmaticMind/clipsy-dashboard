import { Outlet } from "react-router-dom";
import Navigation from "./Navigation";
import EtsyTrademark from "./EtsyTrademark";

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Outlet />
          <div className="mt-12">
            <EtsyTrademark />
          </div>
        </div>
      </div>
    </div>
  );
}
