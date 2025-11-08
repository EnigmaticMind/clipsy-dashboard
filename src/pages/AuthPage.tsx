import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "../components/LoadingSpinner";
import { useToast } from "../contexts/ToastContext";
import { exchangeCodeForToken } from "../services/oauth";

export default function AuthPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [status, setStatus] = useState<"processing" | "success" | "error">(
    "processing"
  );
  const [message, setMessage] = useState("Processing authentication...");

  useEffect(() => {
    const handleAuth = async () => {
      try {
        // Get code and state from URL
        const urlParams = new URLSearchParams(location.hash.split("?")[1]);
        const code = urlParams.get("code");
        const state = urlParams.get("state");

        if (!code || !state) {
          throw new Error("Missing authorization code or state parameter");
        }

        setMessage("Exchanging authorization code for token...");

        // Exchange code for token
        await exchangeCodeForToken(code, state);

        setStatus("success");
        setMessage("Authentication successful! Redirecting...");
        toast.showSuccess("Authentication successful!");

        // Redirect to landing page after a short delay
        setTimeout(() => {
          navigate("/");
        }, 1500);
      } catch (error) {
        console.error("Auth error:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Authentication failed. Please try again.";
        setStatus("error");
        setMessage(errorMessage);
        toast.showError(errorMessage);
      }
    };

    handleAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          {status === "processing" && (
            <>
              <LoadingSpinner />
              <p className="mt-4 text-gray-700">{message}</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="text-green-500 text-5xl mb-4">✓</div>
              <p className="text-gray-700">{message}</p>
            </>
          )}

          {status === "error" && (
            <>
              <div className="text-red-500 text-5xl mb-4">✗</div>
              <p className="text-red-600 mb-4">{message}</p>
              <button
                onClick={() => navigate("/")}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition"
              >
                Return to Dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
