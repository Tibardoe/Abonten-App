export const phoneNumberFormatter = (phone: string) => {
  if (phone.trim().startsWith("0")) {
    const phoneArr = phone.split("");
    phoneArr.shift();
    return phoneArr.join("");
  }

  return phone;
};
