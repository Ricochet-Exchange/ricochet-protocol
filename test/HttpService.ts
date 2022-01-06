import axios, { AxiosResponse } from 'axios';

export default class HttpService {
    async get(baseURL: string): Promise<AxiosResponse> {
        return axios.get(baseURL);
    }
}
