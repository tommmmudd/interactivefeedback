
console.clear();
// use compressor here for dynamics
// https://riptutorial.com/web-audio

let audioContext = new (window.AudioContext || window.webkitAudioContext)();




// Basic Biquad stuck in bandpass mode
class Biquad
{
  constructor()
  {
    this.a0, this.b2, this.b1, this.b2;
    this.filterFreq = 100;
    this.Q = 3;
    this.V = Math.pow(10, 1.0 / 20); // 1.0 was gain, now fixed
    this.sampleRate = 44100;

    this.targetFreq = this.filterFreq;
    this.transitionTimeInSamples = 50;
    this.transitionFreq = this.filterFreq;
    this.transitionCounter = this.transitionTimeInSamples; 


    this.prevX2 = 0; this.prevX1 = 0; this.prevY1 = 0; this.prevY2 = 0;
  }

  setFreq(newFreq)  { this.targetFreq = newFreq; this.transitionFreq = this.filterFreq; this.transitionCounter = 0; }
  //setFreq(freq) { this.filterFreq = freq; }
  setQ(_q) { this.Q = _q; }

  calcCoeffs()
  {
    let K = Math.tan(3.141592653589793 * this.filterFreq / this.sampleRate);
    let norm = 1 / (1 + K / this.Q + K * K);
    this.a0 = K / this.Q * norm;
    this.a2 = -this.a0;
    this.b1 = 2 * (K * K - 1) * norm;
    this.b2 = (1 - K / this.Q + K * K) * norm;
  }
  
  process(inVal)
  {

    if (this.transitionCounter < this.transitionTimeInSamples)
    {
      this.filterFreq += (this.targetFreq - this.transitionFreq) / this.transitionTimeInSamples;
      this.transitionCounter += 1;
      this.calcCoeffs();
    }

    let y = this.a0*inVal  +  this.a2*this.prevX2  -  this.b1*this.prevY1  -  this.b2*this.prevY2;
    this.prevX2 = this.prevX1;
    this.prevX1 = inVal;
    this.prevY2 = this.prevY1;
    this.prevY1 = y;
    return y;  
  }
}




// SIMPLE DELAY CLASS - currently fixed max duration at 1000 samples..
class Delay
{
  constructor()
  {
    this.buffer = [];
    this.size = 1000;
    this.readPos = 0;
    this.writePos = 0;

    for (let i=0; i<this.size; i++)
    {
      this.buffer[i] = 0.0;
    }

  }

  readVal()
  {
      // get current value at readPos
      let outVal = this.linearInterpolation(); //this.buffer[this.readPos];
      // increment readPos
      this.readPos ++;
      
      if (this.readPos >= this.size)
          this.readPos = 0;
   
      return outVal;
  }

  linearInterpolation()
  {
      // get buffer index
      let indexA = Math.floor(this.readPos);
      let indexB = indexA + 1;
      
      // wrap
      if (indexB >= this.size)
          indexB -= this.size;
      
      let valA = this.buffer[indexA];
      let valB = this.buffer[indexB];
      
      let remainder = this.readPos - indexA;
      
      let interpolatedValue = (1-remainder)*valA  +  remainder*valB;
      
      return interpolatedValue;
      
  }

  writeVal(inputSample)
  {
      // store current value at writePos
      this.buffer[this.writePos] = inputSample;
      
      // increment writePos
      this.writePos ++;
      
      if (this.writePos >= this.size)
          this.writePos = 0;
  }

  process(inputSample)
  {
    let outVal = this.readVal(inputSample);
    this.writeVal(inputSample);
    return outVal;
  }

  setDelayTimeInSamples(delayTimeInSamples)
  {
    if (delayTimeInSamples > this.size)
        delayTimeInSamples = this.size;
    
    if (delayTimeInSamples < 1)
        delayTimeInSamples = 1;
    
    this.readPos = this.writePos - delayTimeInSamples;
    
    // if readPos < 0, then add size to readPos
    if (this.readPos < 0)
        this.readPos += this.size;
  }
}


class GutterOsc 
{
  constructor(context)
  {
    let blocksize = 256;
    let gain = 1;

    this.filterCount = 24;

    this.filters = [];//new Biquad()
    for (let i=0; i<this.filterCount; i++)
    {
      this.filters[i] = new Biquad(); 
      let randomFreq = Math.random() * Math.random() * Math.random() * 2000 + 45;
      console.log(randomFreq);
      this.filters[i].setFreq(randomFreq);
      this.filters[i].setQ(10);
      this.filters[i].calcCoeffs();
    }
    

    this.delay = new Delay();
    this.delay.setDelayTimeInSamples(50);

    this.feedbackVal = 0;
    this.feedbackGain = 40.0;

    this.gamma = 0.1; 
    this.omega = 0.125;
    this.c = 0.3;
    this.t = 0;
    this.dt = 0.00001 + Math.random() * 0.00002;
    this.duffX = 0;
    this.duffY = 0;
    this.gain = 0.5;

    //Creating nodes
    this.processor = context.createScriptProcessor(blocksize, 1, 2);

    
    let self = this;
    this.processor.onaudioprocess = function(audioProcessingEvent) {
      let inputBuffer = audioProcessingEvent.inputBuffer;
      let inputData = inputBuffer.getChannelData(0);

      let outputBuffer = audioProcessingEvent.outputBuffer;
      let outputDataL = outputBuffer.getChannelData(0);
      let outputDataR = outputBuffer.getChannelData(1);

      for (let i = 0; i < outputBuffer.length; i++) 
      {
          // make output equal to the same as the input
          //del1 = Math.atan(inputData[i] + del1*1.06);
          
          //let nextInput = inputData[i];//0.25 * Math.atan(inputData[i] + self.feedbackVal*self.feedbackGain);

          let filtered = 0.0;//self.filter.process(nextInput);

          for (let j=0; j<self.filterCount; j++)
          {
            filtered += self.filters[j].process(self.duffX);
          }

          filtered *= self.gain;

          let c = self.c + inputData[i];
          if (c > 1.0) { c = 1.0; }
          if (c < 0.0001) { c = 0.0001; }

          let dy = filtered - (filtered*filtered*filtered) - (c*self.duffY) + self.gamma*Math.sin(self.omega * self.t)
          self.duffY += dy;
          let dx = self.duffY;

          self.duffX = Math.atan(filtered + dx);

          self.t += self.dt;

          if (isNaN(self.duffX)) { self.resetDuff(); }

          let outputSample = filtered * 0.75;// * inputData[i];// * ();
          outputDataL[i] = outputSample;
          outputDataR[i] = outputSample;
      }
      
    }
  }

  resetDuff() { this.duffX = 0; this.duffY = 0; this.dx = 0; this.dy = 0; this.t = 0; }

  setDamping(newC) {this.c = newC;}

  setQ(newQ)
  {
    for (let j=0; j<this.filterCount; j++)
    {
      this.filters[j].setQ(newQ); 
      this.filters[j].calcCoeffs(); 
    }
  }

  setFreq(newFreq)  
  { 
    for (let j=0; j<this.filterCount; j++)
    {
      this.filters[j].setFreq(newFreq * (j+1)); 
      this.filters[j].calcCoeffs(); 
    }
  }

  randomiseFilters()
  {
    this.filterCount = 24;
    for (let j=0; j<this.filterCount; j++)
    {
      let randomFreq = Math.random() * Math.random() * Math.random() * 5055 + 45;
      this.filters[j].setFreq(randomFreq);
      this.filters[j].calcCoeffs();
    }
  }

  randomiseFiltersLow()
  {
    this.filterCount = 24;
    for (let j=0; j<this.filterCount; j++)
    {
      let randomFreq = Math.random() * Math.random() * Math.random() * Math.random() * Math.random() * 5055 + 45;
      this.filters[j].setFreq(randomFreq);
      this.filters[j].calcCoeffs();
    }
  }

  minorFilters(baseNote)
  {
    this.filterCount = 4;
    let harmonics = [55, 110.6, 166.7, 220.1];
    for (let j=0; j<this.filterCount; j++)
    {
      let scaler = Math.exp(0.057762265 * baseNote);  // transratio
      let freq = harmonics[j] * scaler;
      this.filters[j].setFreq(freq);
      this.filters[j].calcCoeffs();
    }
  }

  setDelayTime(newDelayTime)  { this.delay.setDelayTimeInSamples(newDelayTime); }

  get input() {
    return this.processor;
  }

  connect(node) {
    this.processor.connect(node);
  }
}


class WhiteNoise {
  constructor(context) {
    let blocksize = 256;
    let gain = 0.1;
  
    //Creating nodes
    this.processor = context.createScriptProcessor(blocksize, 2, 2);
    
    let self = this;
    this.processor.onaudioprocess = function(audioProcessingEvent) {
      let outputBuffer = audioProcessingEvent.outputBuffer;

      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        let outputData = outputBuffer.getChannelData(channel);

        for (let sample = 0; sample < outputBuffer.length; sample++) {
          // make output equal to the same as the input
          outputData[sample] = gain *(Math.random() - 0.5);
        }
      }
      
    }
  }
  
  connect(node) {
    this.processor.connect(node);
  }
};
var EnvelopeGenerator = (function(context) {
  function EnvelopeGenerator() {
    this.attackTime = 0.001;
    this.releaseTime = 0.1;
  };

  EnvelopeGenerator.prototype.trigger = function() {
    console.log("triggered!!");
    now = context.currentTime;
    this.param.cancelScheduledValues(now);
    this.param.setValueAtTime(0, now);
    this.param.linearRampToValueAtTime(1, now + this.attackTime);
    this.param.linearRampToValueAtTime(0, now + this.attackTime + this.releaseTime);
  };

  EnvelopeGenerator.prototype.connect = function(param) {
    this.param = param;
  };

  return EnvelopeGenerator;
})(audioContext);
class VCA {
  constructor(context) 
  {
    let blocksize = 256;
    this.gain = context.createGain();
    this.gain.gain.value = 0;
  }
  
  get gainVal() {     return this.gain.gain;  }
  get input()   {     return this.gain;        }

  connect(node) {    this.gain.connect(node);  }
};





//============================================================================
//============================================================================
// OBJECTS



//let whiteNoise = new WhiteNoise(audioContext);
//let vca = new VCA(audioContext);
//var envelope = new EnvelopeGenerator;

let gutterOscs = []
let delays = [];
let delayInputGains = [];
let gutterGain = audioContext.createGain(); // for amount of osc interaction
gutterGain.gain.value = 0.35;
for (let i=0; i<8; i++)
{
  gutterOscs[i] = new GutterOsc(audioContext);
  
  delayInputGains[i] = audioContext.createGain();   // for amount of osc interaction
  delayInputGains[i].gain.value = 0;                // interaction is off by default
  delays[i] = audioContext.createDelay(0.1)   // MAX delay time is 0.1 seconds
  delays[i].delayTime.value = 0.05;   // set to ≈2000 samples

  gutterOscs[i].connect(gutterGain);                // gutter oscs straight to their gain bus
  delays[i].connect(delayInputGains[i]);            // delays go to their respective gain
  delayInputGains[i].connect(gutterOscs[i].input);  // each delay goes to one gutter osc
}


for (let i=0; i<8; i++)
{
  for (let j=0; j<8; j++)
  { 
    if (i != j)
    {
      // each gutter osc goes to all delays apart from it's own delay
      gutterOscs[i].connect(delays[j]);
    }
  }
}


//var moogFilter = new Moog(audioContext);

/*var biquadFilter = audioContext.createBiquadFilter();
biquadFilter.type = "bandpass";
//biquadFilter.frequency = 400;
biquadFilter.Q.value = 1.8;
biquadFilter.gain.value = 2;
*/

var compressor = audioContext.createDynamicsCompressor();
compressor.threshold.value = -10;
compressor.knee.value = 0;
compressor.ratio.value = 1.5;
compressor.reduction.value = -20;
compressor.attack.value = 0;
compressor.release.value = 0.2;

let feedbackGain = audioContext.createGain();
feedbackGain.gain.value = 1;

let masterGain = audioContext.createGain();
masterGain.gain.value = 0.45;

//let sourceNode = audioContext.createOscillator();
//sourceNode.type = 'sine';
//sourceNode.frequency.value = 261.6;
//sourceNode.detune.value = 0;


//============================================================================
// ROUTING

//Connect the source to the speakers
//whiteNoise.connect(vca.input);
//envelope.connect(vca.gainVal);
//vca.connect(gutterOsc.input);
//vca.connect(masterGain);

gutterGain.connect(compressor);

compressor.connect(masterGain)

//delay.connect(moogFilter.input);
//biquadFilter.connect(compressor);
//moogFilter.connect(compressor);
//compressor.connect(feedbackGain);
//compressor.connect(delay);
//feedbackGain.connect(delay);
//biquadFilter.connect(masterGain);
//moogFilter.connect(masterGain)
masterGain.connect(audioContext.destination)




//Make the sound audible for 100 ms
//whiteNoise.start();
//window.setTimeout(function() { sourceNode.stop(); }, 100);





//============================================================
// INTERFACE

// SLIDERS
const interactionSlider = document.querySelector(".interaction-slider");
interactionSlider.addEventListener('input', function() 
{
  for (let i=0; i<8; i++)
  {
    delayInputGains[i].gain.value = (this.value * this.value) * 5.0;
  }
}, "false");

const modulationSlider = document.querySelector(".modulation-slider");
modulationSlider.addEventListener('input', function() 
{
  for (let i=0; i<8; i++)
  {
    gutterOscs[i].gamma = (this.value * this.value) * 1.0;
  }
}, "false");


// BUTTONS
const randomiseButton = document.querySelector(".randomise");
randomiseButton.onmousedown = function() 
{ 
  for (let i=0; i<8; i++)
  {
    gutterOscs[i].randomiseFilters();
  }
  console.log("randomising filters"); 
}
//envButton.onmouseup = function() { console.log("released"); }

const randomiseLowButton = document.querySelector(".randomise-low");
randomiseLowButton.onmousedown = function() 
{ 
  for (let i=0; i<8; i++)
  {
    gutterOscs[i].randomiseFiltersLow();
  }
  console.log("randomising filters low"); 
}

const minorButton = document.querySelector(".minor");
minorButton.onmousedown = function() 
{ 
  for (let i=0; i<8; i++)
  {
    let minorScale = [0, 2, 3, 5, 7, 8, 10, 12];
    let note = minorScale[i] + 24;
    gutterOscs[i].minorFilters(note);
  }
  console.log("minor filters"); 
}





// JQUERY Range2DSlider

$('#slider').range2DSlider({
  grid:true,
  axis:[[0, 2, 4, 6, 8, 10],[0, 2, 4, 6, 8, 10]],
  projections:true,
  height:'500px',
  width:'500px',
  showLegend:[0,0],
  allowAxisMove:['both'],
  /*printLabel:function( val ){
    this.projections&&this.projections[0].find('.xdsoft_projection_value_x').text(val[1].toFixed(5));
    return val[0].toFixed(2) + ", " + val[1].toFixed(2);
  }*/
  printLabel:function( val )
  {
    let x = val[0] * 0.1;
    var newFreq = ((x * x) * 350.0) + 45.0;
    //gutterOsc.setFreq(newFreq); 
    for (let i=0; i<8; i++)
    {
      gutterOscs[i].setQ(x*x*200.0 + 0.1)
    }

    let y = val[1] * 0.1;
    //var newDelayTime = Math.floor((y * y) * 998) + 1;
    for (let i=0; i<8; i++)
    {
      gutterOscs[i].setDamping(y * y * y + 0.00001);
    }

    this.projections&&this.projections[0].find('.xdsoft_projection_value_x').text(val[1].toFixed(5));
    return val[0].toFixed(2) + ", " + val[1].toFixed(2);
  }
}).range2DSlider('value',[[5,5]]);

$('#slider').range2DSlider();







// POWER BUTTON
const powerButton = document.querySelector(".control-power");

if (powerButton)
{
  console.log("power button exists");
  powerButton.addEventListener('click', function() {
  if (this.dataset.power === 'on') {
    audioContext.suspend();
    this.dataset.power = 'off';
    console.log("switching off");
    powerButton.innerHTML = "Turn Audio On";
    powerButton.style.background = "#efefef";
  } else if (this.dataset.power === 'off') {
    audioContext.resume();
    this.dataset.power = 'on';
    console.log("switching on");
    powerButton.innerHTML = "Turn Audio Off";
    powerButton.style.background = "#4CCF90";

  }
  this.setAttribute( "aria-checked", audioContext.state ? "false" : "true" );
  console.log(audioContext.state);
}, false);
}
else 
{
	console.log("power button dunt exist yet");
}

function switchOn() 
{
	audioContext.resume();
}


//============================================================
// DRAWING ANALYSER

var analyser = audioContext.createAnalyser();
masterGain.connect(analyser);
analyser.fftSize = 4096;
var bufferLength = analyser.frequencyBinCount;
var bufferToUse = bufferLength/6
console.log(bufferLength);
var dataArray = new Uint8Array(bufferToUse);

var canvas = document.querySelector('.visualizer');
var canvasCtx = canvas.getContext("2d");


//canvasCtx.fillStyle = 'rgb(200, 100, 50)';
//canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
function draw() {

  drawVisual = requestAnimationFrame(draw);

  analyser.getByteFrequencyData(dataArray);

  canvasCtx.fillStyle = 'rgb(239, 239, 239)';//  - this is #efefef?
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  var barWidth = (canvas.width / bufferToUse) * 2.5;
  var barHeight;
  var x = 0;
  for(var i = 0; i < bufferToUse; i++) 
  {
    barHeight = dataArray[i]/2;
    barHeight = barHeight / 150.0;
    barHeight *= barHeight*barHeight;
    barHeight *= 75

    canvasCtx.fillStyle = 'rgb(50,50,'+(barHeight+50)+')';
    canvasCtx.fillRect(x, canvas.height - barHeight/2, barWidth, barHeight);

    x += barWidth + 1;
  }
};

draw();

