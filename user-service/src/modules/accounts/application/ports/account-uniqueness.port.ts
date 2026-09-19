import type { NusEmail } from '../../domain/nus-email.js';
import type { PhoneNumber } from '../../domain/phone-number.js';
import type { Username } from '../../domain/username.js';

export interface AccountUniquenessPort {
  isEmailTaken(email: NusEmail): Promise<boolean>;
  isPhoneNumberTaken(phoneNumber: PhoneNumber): Promise<boolean>;
  isUsernameTaken(username: Username): Promise<boolean>;
}
