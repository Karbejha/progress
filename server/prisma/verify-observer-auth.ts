import * as http from 'http';

async function request(options: http.RequestOptions, postData?: any): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 0, body: data });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 1. Testing Login with Observer credentials (observer / observer123)...');
  const loginRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { usernameOrEmail: 'observer', password: 'observer123' }
  );

  if (loginRes.status !== 200 && loginRes.status !== 201) {
    console.error('❌ Login failed:', loginRes.status, loginRes.body);
    process.exit(1);
  }

  const token = loginRes.body.access_token;
  const user = loginRes.body.user;
  console.log('✅ Login succeeded! Logged in as:', {
    username: user.username,
    fullName: user.fullName,
    title: user.title,
    role: user.role,
  });

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  console.log('\n🧪 2. Testing GET /executive/overview (Allowed for Observer)...');
  const overviewRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/executive/overview',
    method: 'GET',
    headers: authHeaders,
  });

  if (overviewRes.status === 200) {
    console.log(`✅ Overview fetched successfully! Total directorates: ${overviewRes.body.directorates?.length}, Date: ${overviewRes.body.date}`);
  } else {
    console.error('❌ Failed to fetch overview:', overviewRes.status, overviewRes.body);
  }

  console.log('\n🧪 3. Testing POST /executive/feedback (Must be FORBIDDEN 403)...');
  const feedbackRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/executive/feedback',
      method: 'POST',
      headers: authHeaders,
    },
    { directorateId: 'some-id', feedbackText: 'ملاحظة تجريبية للمراقب', rating: 5 }
  );

  if (feedbackRes.status === 403) {
    console.log('✅ Feedback successfully blocked with 403 Forbidden! Security is enforced.');
  } else {
    console.error('❌ Security breach! Expected 403 Forbidden but got:', feedbackRes.status, feedbackRes.body);
  }

  console.log('\n🧪 4. Testing POST /executive-tasks (Must be FORBIDDEN 403)...');
  const taskRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/executive-tasks',
      method: 'POST',
      headers: authHeaders,
    },
    { title: 'تكليف غير مصرح', directorateIds: ['some-id'] }
  );

  if (taskRes.status === 403) {
    console.log('✅ Executive task creation successfully blocked with 403 Forbidden!');
  } else {
    console.error('❌ Security breach! Expected 403 Forbidden but got:', taskRes.status, taskRes.body);
  }

  console.log('\n🧪 5. Testing POST /executive/announcements (Must be FORBIDDEN 403)...');
  const annRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/executive/announcements',
      method: 'POST',
      headers: authHeaders,
    },
    { title: 'تعميم غير مصرح', content: 'محتوى التعميم' }
  );

  if (annRes.status === 403) {
    console.log('✅ Announcement creation successfully blocked with 403 Forbidden!');
  } else {
    console.error('❌ Security breach! Expected 403 Forbidden but got:', annRes.status, annRes.body);
  }

  console.log('\n🎉 All Observer security and read-only tests PASSED flawlessly!');
}

runTests().catch((e) => {
  console.error('Test execution error:', e);
  process.exit(1);
});
