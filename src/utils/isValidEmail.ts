import { EMAIL_REGEX } from '../constants';

export const isValidEmail = (email: string) => EMAIL_REGEX.test(email);
