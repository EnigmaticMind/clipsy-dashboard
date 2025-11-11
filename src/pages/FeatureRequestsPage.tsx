import FeatureVoting from "../components/FeatureVoting";

export default function FeatureRequestsPage() {
  return (
    <>
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Feature Requests
        </h1>
        <p className="text-xl text-gray-600">
          Help us prioritize features! Vote on what you'd like to see next.
        </p>
      </div>

      {/* Feature Voting */}
      <FeatureVoting />
    </>
  );
}

