import axios from 'axios'

const api = axios.create({
  baseURL: 'https://secure-one-to-one-messaging-system.onrender.com/api'
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
