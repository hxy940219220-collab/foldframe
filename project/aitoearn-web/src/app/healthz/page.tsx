export default function HealthzPage() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: 'Arial, sans-serif',
        backgroundColor: '#fff',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: '#4CAF50', marginBottom: '20px' }}>OK</h1>
        <p style={{ color: '#666', fontSize: '16px' }}>Service is healthy</p>
      </div>
    </div>
  )
}
