/**
 * Process-local flag: while set, signup provisioning must not create a
 * customer Organization for an unlinked platform operator User.
 * Only the platform:provision-super-admin CLI sets this.
 */
let active = false;

export function beginPlatformSuperAdminProvisioning(): void {
  active = true;
}

export function endPlatformSuperAdminProvisioning(): void {
  active = false;
}

export function isPlatformSuperAdminProvisioningActive(): boolean {
  return active;
}
