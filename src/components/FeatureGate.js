// src/components/FeatureGate.js
//
// Hide UI elements at runtime based on the per-user "hidden features" set
// fetched from Odoo's user_privilege_manager module at login time.
//
// Usage:
//   <FeatureGate featureKey="home.banner">
//     <CarouselPagination />
//   </FeatureGate>
//
// To gate something inline (e.g. a button inside another component) use the
// hook variant:
//   const hidden = useFeatureHidden('cart.checkout_button');
//   if (hidden) return null;
//
// To make a key gateable in Odoo, create a matching record in
//   Privilege Manager → Configuration → App Features
// and then assign it per-user (Hide App Feature) or per-role (Group form).
import { useAuthStore } from '@stores/auth';

export const useFeatureHidden = (featureKey) =>
  useAuthStore((s) => s.hiddenFeatures.has(featureKey));

export const FeatureGate = ({ featureKey, children, fallback = null }) => {
  const hidden = useFeatureHidden(featureKey);
  if (hidden) return fallback;
  return children;
};

export default FeatureGate;
