import type { AxiosRequestConfig } from "axios";
import api from "./api";

export async function fetchSpreadsheetExport(
  url: string,
  config?: Omit<AxiosRequestConfig, "responseType">,
): Promise<Blob> {
  const { data } = await api.get<Blob>(url, {
    ...config,
    responseType: "blob",
  });
  return data;
}
