import ContactForm from "../components/ContactForm";
import FeatureVoting from "../components/FeatureVoting";

export default function ContactPage() {
  return (
    <>
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Contact & Feedback
        </h1>
        <p className="text-xl text-gray-600">
          Have suggestions, improvements, or feedback? We'd love to hear from
          you!
        </p>
      </div>

      {/* Feature Voting */}
      <FeatureVoting />

      {/* Contact Form */}
      <ContactForm />
    </>
  );
}
