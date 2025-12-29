export const useBusinessSignin = () => {
  return {
    additionalData: {},
    preSocialSigninCheck: async () => {
      return true;
    },
    ssoProviders: [],
  };
};
