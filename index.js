const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");
const cors = require("cors");
const port = process.env.PORT || 5000;
require("dotenv").config();
var nodemailer = require("nodemailer");
var sgTransport = require("nodemailer-sendgrid-transport");

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.crxfa.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyJwt = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.statue(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

const emailSenderOptions = {
  auth: {
    api_key: process.env.EMAIL_SENDER_KEY,
  },
};

const EmailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));

function sendAppointmentEmail(bookingInfo) {
  const { treatment, date, slot, patient, patientName } = bookingInfo;

  const email = {
    from: process.env.EMAIL_SENDER,
    to: patient,
    subject: `Your Appointment for ${treatment} is on ${date} at ${slot}`,
    text: `Your Appointment for ${treatment} is on ${date} at ${slot}`,
    html: `
        <div>
        <p>Hello ${patientName}</p>
        <h3>Your Appointment for ${treatment} is confirmed</h3>
        <p>Looking forward to seeing you on ${date} at ${slot}.</p>
        <h3>Our Address</h3>
        <p>amdorkilla bandorbon</p>
        <p>Bangladesh</p>
        <a href="https://www.programming-hero.com/">Unsubscribe</a>
        </div>
        `,
  };

  EmailClient.sendMail(email, function (err, info) {
    if (err) {
      console.log(err);
    } else {
      console.log("Message sent: ", info);
    }
  });
}

async function run() {
  try {
    await client.connect();
    const serviceCollection = client
      .db("doctors_portal")
      .collection("services");
    const bookingInfoCollection = client
      .db("doctors_portal")
      .collection("booking-info");
    const userCollection = client.db("doctors_portal").collection("user");
    const doctorCollection = client.db("doctors_portal").collection("doctor");

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    };

    app.get("/user", verifyJwt, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/admin/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    app.put("/user/admin/:email", verifyJwt, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updatedDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      return res.send(result);
    });

    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updatedDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1d" }
      );
      res.send({ result, token });
    });

    app.get("/doctor", verifyJwt, verifyAdmin, async (req, res) => {
      const doctors = await doctorCollection.find({}).toArray();
      res.send(doctors);
    });

    app.post("/doctor", verifyJwt, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    });

    app.delete("/doctor/:email", verifyJwt, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await doctorCollection.deleteOne(filter);
      res.send(result);
    });

    app.get("/bookingInfo", verifyJwt, async (req, res) => {
      const patient = req.query.email;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingInfoCollection.find(query).toArray();
        return res.send(bookings);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    });

    app.post("/bookingInfo", async (req, res) => {
      const bookingInfo = req.body;
      const query = {
        treatment: bookingInfo.treatment,
        date: bookingInfo.date,
        patient: bookingInfo.patient,
      };
      const exists = await bookingInfoCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, bookingInfo: exists });
      }
      const result = await bookingInfoCollection.insertOne(bookingInfo);
      console.log('email sending')
      sendAppointmentEmail(bookingInfo);
      res.send({ success: true, result });
    });

    app.get("/services", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query).project({ name: 1 });
      const services = await cursor.toArray();
      res.send(services);
    });

    app.get("/available", async (req, res) => {
      const date = req.query.date;
      // step 1: get all services
      const services = await serviceCollection.find().toArray();

      // step 2: get the booking of that day. output [{}, {}, {}, {}, {}, {}]
      const query = { date: date };
      const bookings = await bookingInfoCollection.find(query).toArray();

      // step 3: for each  service
      services.forEach((service) => {
        // step 4: find booking for that service. output [{}, {}, {}]
        const serviceBookings = bookings.filter(
          (book) => book.treatment === service.name
        );
        // step 5: select slots for the service bookings. output ['', '', '']
        const bookedSlots = serviceBookings.map((book) => book.slot);
        // step 6: select those slots that are not in bookedSlots
        const available = service.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        // step 7: set available to slots to make it easier
        service.slots = available;
      });
      res.send(services);
    });

    /*
     * API naming convention
     * app.get('/booking) // get all booking in this collection. or get more than one or by filter
     * app.get('/booking/:id) //get a specific booking
     * app.post('/booking) // add a new booking
     * app.patch('/booking/:id')
     * app.delete('/booking/:id')
     */
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello Doctor Uncle");
});

app.listen(port, () => {
  console.log(`Doctor app listening on port ${port}`);
});
