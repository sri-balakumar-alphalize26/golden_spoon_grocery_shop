import { create } from 'zustand';

const useProductStore = create((set, get) => ({
  currentCustomerId: null,
  cartItems: {}, // Object: {customerId: [...items]}
  
  // Set current customer
  setCurrentCustomer: (customerId) => set({ currentCustomerId: customerId }),
  
  // Get current customer's cart
  getCurrentCart: () => {
    const { currentCustomerId, cartItems } = get();
    return cartItems[currentCustomerId] || [];
  },
  
  // Backward compatibility - returns current customer's products
  get products() {
    return get().getCurrentCart();
  },
  
  addProduct: (product) => set((state) => {
    // Ensure we have a customer context; fall back to a guest cart
    const customerId = state.currentCustomerId || 'pos_guest';

    const currentCart = Array.isArray(state.cartItems[customerId]) ? state.cartItems[customerId].slice() : [];

    // Normalize incoming product fields
    const incomingId = product.id ?? product.remoteId ?? null;
    const priceUnit = typeof product.price_unit !== 'undefined' ? Number(product.price_unit) : (typeof product.price !== 'undefined' ? Number(product.price) : Number(product.price_unit ?? product.price ?? 0));
    const qty = Number(product.quantity ?? product.qty ?? 1);

    // Find existing item by id
    const idx = currentCart.findIndex(p => String(p.id) === String(incomingId));
    if (idx >= 0) {
      // Update existing item
      const existing = { ...currentCart[idx] };
      existing.quantity = qty;
      existing.qty = qty;
      if (typeof product.price !== 'undefined') existing.price = Number(product.price);
      if (typeof product.price_unit !== 'undefined') existing.price_unit = Number(product.price_unit);
      // Recalculate subtotals - use fixed discount_amount (stays same when qty changes)
      const unitPrice = Number(existing.price_unit ?? existing.price ?? 0);
      const rawSubtotal = unitPrice * (existing.quantity || existing.qty || 1);
      // Fixed discount amount stays the same regardless of qty change
      const discountAmt = Number(existing.discount_amount || 0);
      const discounted = discountAmt > 0 ? Number((rawSubtotal - discountAmt).toFixed(3)) : Number(rawSubtotal.toFixed(3));
      existing.price_subtotal = Math.max(0, discounted);
      existing.price_subtotal_incl = Math.max(0, discounted);
      currentCart[idx] = existing;
    } else {
      // Add new item
      const newPrice = typeof product.price !== 'undefined' ? Number(product.price) : priceUnit;
      const prod = {
        ...product,
        id: incomingId,
        quantity: qty,
        qty: qty,
        price: newPrice,
        price_unit: priceUnit,
        // initialize without discount
        discount_amount: 0,
        discount_percent: 0,
        price_subtotal: Number((priceUnit * qty).toFixed(3)),
        price_subtotal_incl: Number((priceUnit * qty).toFixed(3)),
      };
      currentCart.push(prod);
    }

    return {
      ...state,
      currentCustomerId: state.currentCustomerId || 'pos_guest',
      cartItems: {
        ...state.cartItems,
        [customerId]: currentCart
      }
    };
  }),

  // Set per-item discount as fixed amount (stays same when qty changes)
  setProductDiscount: (productId, amount) => set((state) => {
    const customerId = state.currentCustomerId || 'pos_guest';
    const currentCart = Array.isArray(state.cartItems[customerId]) ? state.cartItems[customerId].slice() : [];
    const idx = currentCart.findIndex(p => String(p.id) === String(productId));
    if (idx < 0) return state;
    const item = { ...currentCart[idx] };
    const unitPrice = Number(item.price_unit ?? item.price ?? 0);
    const qty = Number(item.quantity ?? item.qty ?? 1);
    const rawSubtotal = unitPrice * qty;
    const discountAmt = Number(amount) || 0;
    const discounted = discountAmt > 0 ? Number((rawSubtotal - discountAmt).toFixed(3)) : Number(rawSubtotal.toFixed(3));
    item.discount_amount = discountAmt;
    // Also store percent for display purposes
    item.discount_percent = rawSubtotal > 0 ? Number(((discountAmt / rawSubtotal) * 100).toFixed(2)) : 0;
    item.price_subtotal = Math.max(0, discounted);
    item.price_subtotal_incl = Math.max(0, discounted);
    currentCart[idx] = item;
    return {
      ...state,
      cartItems: { ...state.cartItems, [customerId]: currentCart }
    };
  }),
  
  removeProduct: (productId) => set((state) => {
    const { currentCustomerId } = state;
    if (!currentCustomerId) return state;
    
    const currentCart = state.cartItems[currentCustomerId] || [];
    return {
      ...state,
      cartItems: {
        ...state.cartItems,
        [currentCustomerId]: currentCart.filter((product) => product.id !== productId)
      }
    };
  }),
  
  clearProducts: () => set((state) => {
    const { currentCustomerId } = state;
    if (!currentCustomerId) return state;
    
    return {
      ...state,
      cartItems: {
        ...state.cartItems,
        [currentCustomerId]: []
      }
    };
  }),
  
  // Load customer cart (from API or localStorage)
  loadCustomerCart: (customerId, cartData) => set((state) => ({
    ...state,
    currentCustomerId: customerId,
    cartItems: {
      ...state.cartItems,
      [customerId]: cartData || []
    }
  })),
  
  // Clear all carts
  clearAllCarts: () => set({ cartItems: {}, currentCustomerId: null }),
}));

export default useProductStore;
