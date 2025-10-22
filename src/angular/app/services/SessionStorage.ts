const showExpertOptionsItem = "showExpertOptions";
const authToken = "modbus2mqtt.authToken";
export class SessionStorage {
  toggleShowExpertOptions() {
    let options = sessionStorage.getItem(showExpertOptionsItem);
    if (options) sessionStorage.removeItem(showExpertOptionsItem);
    else sessionStorage.setItem(showExpertOptionsItem, "true");
  }
  getShowExpertOptions(): boolean {
    return sessionStorage.getItem(showExpertOptionsItem) != null;
  }
  setAuthToken(token: string) {
    sessionStorage.setItem(authToken, token);
  }
  removeAuthToken() {
    sessionStorage.removeItem(authToken);
  }

  getAuthToken(): string | null {
    return sessionStorage.getItem(authToken);
  }
}
