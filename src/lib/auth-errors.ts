export const DUPLICATE_ACCOUNT_ERROR =
  "This account has already been created.";

export function friendlyAuthError(message: string, code?: string) {
  const lowerMessage = message.toLowerCase();

  if (code === "invalid_login_credentials" || lowerMessage.includes("invalid login")) {
    return "We don't have an account with these login credentials. You may need to create a new account or use forgot password.";
  }
  if (
    lowerMessage.includes("already registered") ||
    lowerMessage.includes("already exists") ||
    lowerMessage.includes("already been created")
  ) {
    return DUPLICATE_ACCOUNT_ERROR;
  }
  if (lowerMessage.includes("email not confirmed")) {
    return "We couldn't complete sign-in for this account. Please try again or use forgot password.";
  }
  if (
    lowerMessage.includes("password should contain at least one character of each") ||
    (lowerMessage.includes("password") &&
      lowerMessage.includes("lowercase") &&
      lowerMessage.includes("uppercase") &&
      lowerMessage.includes("number") &&
      lowerMessage.includes("symbol"))
  ) {
    return "Use a stronger password: include at least 1 lowercase letter, 1 uppercase letter, 1 number, and 1 symbol.";
  }
  if (lowerMessage.includes("password should be at least")) {
    return "Choose a stronger password (minimum 8 characters with letters and numbers).";
  }
  return message;
}
